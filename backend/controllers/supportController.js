import SupportTicket from "../models/supportTicketModel.js";
import SupportAgent from "../models/supportAgentModel.js";
import userModel from "../models/userModel.js";

// Helper: Auto-assign ticket to best available agent
const autoAssignTicket = async (ticket) => {
  try {
    // Find available agents matching the ticket category/department
    const departmentMap = {
      'order': 'orders',
      'payment': 'payments',
      'delivery': 'delivery',
      'refund': 'refunds',
      'technical': 'technical',
      'account': 'general',
      'other': 'general'
    };

    const department = departmentMap[ticket.category] || 'general';

    // Find agents who can take the ticket
    const availableAgents = await SupportAgent.find({
      status: 'active',
      isAvailable: true,
      $or: [
        { department: department },
        { department: 'general' }
      ],
      $expr: { $lt: ['$currentTickets', '$maxTickets'] }
    })
    .sort({ 
      currentTickets: 1, // Prefer agents with fewer tickets
      averageResponseTime: 1, // Prefer faster agents
      rating: -1 // Prefer highly rated agents
    })
    .limit(1);

    if (availableAgents.length > 0) {
      const agent = availableAgents[0];
      ticket.assignedTo = agent._id;
      ticket.assignedAt = new Date();
      ticket.autoAssigned = true;
      ticket.status = 'assigned';
      
      // Update agent's current ticket count
      agent.currentTickets += 1;
      await agent.save();
      
      return agent;
    }
    return null;
  } catch (error) {
    console.error('Error in auto-assignment:', error);
    return null;
  }
};

// Create support ticket
const createTicket = async (req, res) => {
  try {
    const { orderId, subject, message, category, priority } = req.body;
    const userId = req.body.userId;

    if (!subject || !message) {
      return res.status(400).json({ 
        success: false, 
        message: "Subject and message are required" 
      });
    }

    // Get user details
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Determine priority if not provided
    let ticketPriority = priority || 'medium';
    if (category === 'payment' || category === 'refund') {
      ticketPriority = 'high';
    }

    // Create ticket
    const ticket = new SupportTicket({
      userId,
      userName: user.name,
      userEmail: user.email,
      orderId: orderId || null,
      subject: subject.trim(),
      initialMessage: message.trim(),
      category: category || 'other',
      priority: ticketPriority
    });

    // Add initial message
    ticket.addMessage(userId, 'user', user.name, message.trim());

    await ticket.save();

    // Try auto-assignment
    const assignedAgent = await autoAssignTicket(ticket);
    if (assignedAgent) {
      await ticket.save();
    }

    res.status(201).json({ 
      success: true, 
      message: "Support ticket created successfully",
      data: ticket
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, message: "Error creating support ticket" });
  }
};

// Get user's tickets
const getMyTickets = async (req, res) => {
  try {
    const userId = req.body.userId;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tickets = await SupportTicket.find(query)
      .populate('orderId', 'orderNumber status')
      .populate('assignedTo', 'agentName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SupportTicket.countDocuments(query);

    res.status(200).json({ 
      success: true, 
      data: tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, message: "Error fetching tickets" });
  }
};

// Get ticket by ID
const getTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.body.userId;
    const userRole = req.body.role;

    // Users can only see their own tickets, admins/agents can see all
    const query = { _id: ticketId };
    if (userRole !== 'admin') {
      query.userId = userId;
    }

    const ticket = await SupportTicket.findOne(query)
      .populate('orderId')
      .populate('assignedTo', 'agentName email phone department')
      .populate('escalatedTo', 'agentName email');

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    // Mark user messages as read if viewing as agent
    if (userRole === 'admin' && ticket.assignedTo) {
      ticket.messages.forEach(msg => {
        if (msg.senderType === 'user' && !msg.isRead) {
          msg.isRead = true;
          msg.readAt = new Date();
        }
      });
      await ticket.save();
    }

    res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ success: false, message: "Error fetching ticket" });
  }
};

// Add message to ticket (conversation)
const addMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message, attachments } = req.body;
    const userId = req.body.userId;
    const userRole = req.body.role;

    if (!message) {
      return res.status(400).json({ 
        success: false, 
        message: "Message is required" 
      });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    // Check permissions
    if (userRole !== 'admin' && ticket.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Get sender info
    const user = await userModel.findById(userId);
    const senderName = userRole === 'admin' 
      ? (await SupportAgent.findOne({ userId }))?.agentName || user.name
      : user.name;
    const senderType = userRole === 'admin' ? 'agent' : 'user';

    // Add message
    await ticket.addMessage(userId, senderType, senderName, message.trim(), attachments || []);

    res.status(200).json({ 
      success: true, 
      message: "Message added successfully",
      data: ticket
    });
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ success: false, message: "Error adding message" });
  }
};

// Admin: Get all tickets with advanced filtering
const getAllTickets = async (req, res) => {
  try {
    const { 
      status, 
      category, 
      priority,
      assignedTo,
      escalated,
      slaBreached,
      search,
      page = 1, 
      limit = 50 
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;
    if (escalated === 'true') query.escalated = true;
    if (slaBreached === 'true') query.slaBreached = true;
    
    if (search) {
      query.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tickets = await SupportTicket.find(query)
      .populate('orderId', 'orderNumber')
      .populate('assignedTo', 'agentName email department')
      .populate('userId', 'name email')
      .sort({ 
        priority: -1, // Urgent first
        createdAt: -1 
      })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SupportTicket.countDocuments(query);

    // Statistics
    const stats = {
      total,
      open: await SupportTicket.countDocuments({ status: 'open' }),
      assigned: await SupportTicket.countDocuments({ status: 'assigned' }),
      inProgress: await SupportTicket.countDocuments({ status: 'in_progress' }),
      resolved: await SupportTicket.countDocuments({ status: 'resolved' }),
      closed: await SupportTicket.countDocuments({ status: 'closed' }),
      escalated: await SupportTicket.countDocuments({ escalated: true }),
      slaBreached: await SupportTicket.countDocuments({ slaBreached: true })
    };

    res.status(200).json({ 
      success: true, 
      data: tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      statistics: stats
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, message: "Error fetching tickets" });
  }
};

// Admin: Assign ticket to agent
const assignTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { agentId } = req.body;
    const adminId = req.body.userId;

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    // If unassigning
    if (!agentId) {
      if (ticket.assignedTo) {
        const oldAgent = await SupportAgent.findById(ticket.assignedTo);
        if (oldAgent) {
          oldAgent.currentTickets = Math.max(0, oldAgent.currentTickets - 1);
          await oldAgent.save();
        }
      }
      ticket.assignedTo = null;
      ticket.assignedAt = null;
      ticket.status = 'open';
      await ticket.save();
      return res.status(200).json({ 
        success: true, 
        message: "Ticket unassigned successfully",
        data: ticket
      });
    }

    const agent = await SupportAgent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    if (!agent.canTakeTicket()) {
      return res.status(400).json({ 
        success: false, 
        message: "Agent is not available or has reached maximum tickets" 
      });
    }

    // Unassign from previous agent if any
    if (ticket.assignedTo && ticket.assignedTo.toString() !== agentId) {
      const oldAgent = await SupportAgent.findById(ticket.assignedTo);
      if (oldAgent) {
        oldAgent.currentTickets = Math.max(0, oldAgent.currentTickets - 1);
        await oldAgent.save();
      }
    }

    // Assign to new agent
    ticket.assignedTo = agentId;
    ticket.assignedAt = new Date();
    ticket.assignedBy = adminId;
    ticket.autoAssigned = false;
    ticket.status = 'assigned';
    
    agent.currentTickets += 1;
    await agent.save();
    await ticket.save();

    res.status(200).json({ 
      success: true, 
      message: "Ticket assigned successfully",
      data: ticket
    });
  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({ success: false, message: "Error assigning ticket" });
  }
};

// Admin: Update ticket status
const updateTicketStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, priority, tags } = req.body;

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    if (status) {
      const validStatuses = ['open', 'assigned', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'escalated'];
      if (validStatuses.includes(status)) {
        ticket.status = status;
        
        if (status === 'resolved') {
          await ticket.markResolved();
          // Update agent stats
          if (ticket.assignedTo) {
            const agent = await SupportAgent.findById(ticket.assignedTo);
            if (agent && ticket.resolutionDuration) {
              await agent.updateStats(
                ticket.firstResponseDuration,
                ticket.resolutionDuration,
                null
              );
            }
          }
        } else if (status === 'closed') {
          ticket.closedAt = new Date();
          // Release agent
          if (ticket.assignedTo) {
            const agent = await SupportAgent.findById(ticket.assignedTo);
            if (agent) {
              agent.currentTickets = Math.max(0, agent.currentTickets - 1);
              await agent.save();
            }
          }
        }
      }
    }

    if (priority) {
      ticket.priority = priority;
      // Recalculate SLA
      const hours = { 'urgent': 2, 'high': 4, 'medium': 8, 'low': 24 };
      ticket.slaDeadline = new Date(Date.now() + (hours[priority] || 8) * 60 * 60 * 1000);
    }

    if (tags) {
      ticket.tags = Array.isArray(tags) ? tags : [tags];
    }

    await ticket.save();

    res.status(200).json({ 
      success: true, 
      message: "Ticket updated successfully",
      data: ticket
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ success: false, message: "Error updating ticket" });
  }
};

// Admin: Escalate ticket
const escalateTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { agentId, reason } = req.body;

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    if (agentId) {
      const agent = await SupportAgent.findById(agentId);
      if (!agent) {
        return res.status(404).json({ success: false, message: "Agent not found" });
      }
      await ticket.escalate(agentId, reason);
    } else {
      // Escalate without specific agent (will be auto-assigned)
      ticket.escalated = true;
      ticket.escalatedAt = new Date();
      ticket.status = 'escalated';
      ticket.priority = 'urgent';
      await ticket.save();
      await autoAssignTicket(ticket);
    }

    await ticket.save();

    res.status(200).json({ 
      success: true, 
      message: "Ticket escalated successfully",
      data: ticket
    });
  } catch (error) {
    console.error('Error escalating ticket:', error);
    res.status(500).json({ success: false, message: "Error escalating ticket" });
  }
};

// User: Update ticket
const updateTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { subject, category, priority } = req.body;
    const userId = req.body.userId;

    const ticket = await SupportTicket.findOne({ _id: ticketId, userId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    // Only allow update if ticket is open or assigned
    if (ticket.status !== 'open' && ticket.status !== 'assigned') {
      return res.status(400).json({ 
        success: false, 
        message: "Can only update tickets that are open or assigned" 
      });
    }

    if (subject) ticket.subject = subject.trim();
    if (category) ticket.category = category;
    if (priority) ticket.priority = priority;

    await ticket.save();

    res.status(200).json({ 
      success: true, 
      message: "Ticket updated successfully",
      data: ticket
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ success: false, message: "Error updating ticket" });
  }
};

// User: Delete ticket
const deleteTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.body.userId;

    const ticket = await SupportTicket.findOne({ _id: ticketId, userId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    // Only allow delete if ticket is open or assigned
    if (ticket.status !== 'open' && ticket.status !== 'assigned') {
      return res.status(400).json({ 
        success: false, 
        message: "Can only delete tickets that are open or assigned" 
      });
    }

    await SupportTicket.findByIdAndDelete(ticketId);

    res.status(200).json({ 
      success: true, 
      message: "Ticket deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ success: false, message: "Error deleting ticket" });
  }
};

// User: Rate ticket resolution
const rateTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { rating, feedback } = req.body;
    const userId = req.body.userId;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        message: "Rating must be between 1 and 5" 
      });
    }

    const ticket = await SupportTicket.findOne({ _id: ticketId, userId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      return res.status(400).json({ 
        success: false, 
        message: "Can only rate resolved or closed tickets" 
      });
    }

    ticket.customerRating = rating;
    ticket.customerFeedback = feedback || '';
    ticket.ratedAt = new Date();
    await ticket.save();

    // Update agent rating if assigned
    if (ticket.assignedTo) {
      const agent = await SupportAgent.findById(ticket.assignedTo);
      if (agent) {
        await agent.updateStats(null, null, rating);
      }
    }

    res.status(200).json({ 
      success: true, 
      message: "Rating submitted successfully",
      data: ticket
    });
  } catch (error) {
    console.error('Error rating ticket:', error);
    res.status(500).json({ success: false, message: "Error submitting rating" });
  }
};

// Admin: Add internal note
const addInternalNote = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { note } = req.body;
    const userId = req.body.userId;

    if (!note) {
      return res.status(400).json({ 
        success: false, 
        message: "Note is required" 
      });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    ticket.internalNotes.push({
      note: note.trim(),
      addedBy: userId
    });

    await ticket.save();

    res.status(200).json({ 
      success: true, 
      message: "Note added successfully",
      data: ticket
    });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ success: false, message: "Error adding note" });
  }
};

// FAQ data
const getFAQ = async (req, res) => {
  try {
    const faq = [
      {
        question: "How do I place an order?",
        answer: "Browse our menu, add items to your cart, and proceed to checkout. You'll need to provide your delivery address and payment information."
      },
      {
        question: "What payment methods do you accept?",
        answer: "We accept multiple payment methods including UPI, Credit/Debit Cards, Net Banking, Wallets, and Cash on Delivery (COD)."
      },
      {
        question: "How long does delivery take?",
        answer: "Delivery typically takes 30-45 minutes depending on your location and order size."
      },
      {
        question: "Can I cancel my order?",
        answer: "You can cancel your order within 5 minutes of placing it. After that, please contact support."
      },
      {
        question: "How do I track my order?",
        answer: "Go to 'My Orders' and click on your order to see real-time tracking information."
      },
      {
        question: "What if I have a complaint?",
        answer: "Please contact our support team through the support section. We'll respond within 24 hours."
      },
      {
        question: "How do I request a refund?",
        answer: "Contact support with your order number and reason for refund. Our team will review and process your request."
      },
      {
        question: "Can I modify my order after placing it?",
        answer: "Orders can be modified within 5 minutes of placement. After that, please contact support for assistance."
      }
    ];

    res.status(200).json({ success: true, data: faq });
  } catch (error) {
    console.error('Error fetching FAQ:', error);
    res.status(500).json({ success: false, message: "Error fetching FAQ" });
  }
};

export { 
  createTicket, 
  getMyTickets, 
  getTicket, 
  addMessage,
  updateTicket,
  deleteTicket,
  getAllTickets, 
  assignTicket,
  updateTicketStatus,
  escalateTicket,
  rateTicket,
  addInternalNote,
  getFAQ 
};
